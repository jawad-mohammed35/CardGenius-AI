"use client";

import { z } from "zod";
import { useCloudAccount } from "./cloud-account";

export const avatarIcons = ["Person", "Book", "Leaf", "Cat", "Coffee", "Moon", "Mountain", "Music", "Heart", "Headphones", "Rocket", "Compass", "Camera", "Flower", "Feather", "Palette"] as const;
export const avatarColors = [
  { id: "stone", label: "Stone", value: "#e5ddd6" },
  { id: "lavender", label: "Lavender", value: "#e7dbf8" },
  { id: "sage", label: "Sage", value: "#d7e9d9" },
  { id: "rose", label: "Rose", value: "#f3dadd" },
  { id: "peach", label: "Peach", value: "#f8dfcb" },
  { id: "sky", label: "Sky", value: "#dbe9f2" },
] as const;

const profileSchema = z.object({
  name: z.string().trim().min(1).max(48),
  icon: z.enum(avatarIcons),
  color: z.enum(["stone", "lavender", "sage", "rose", "peach", "sky"]),
  image: z.string().max(500_000).regex(/^data:image\/(webp|png);base64,[A-Za-z0-9+/=]+$/).optional(),
});

export type LocalProfile = z.infer<typeof profileSchema> & { providerImage?: string };
export const defaultProfile: LocalProfile = { name: "Guest", icon: "Person", color: "stone" };

export function useUserProfile(): LocalProfile {
  const { user, profile } = useCloudAccount();
  const metadata = user?.user_metadata;
  const fallback = [metadata?.full_name, metadata?.name, user?.email?.split("@")[0]].find((value) => typeof value === "string" && value.trim());
  const name = (profile?.display_name ?? fallback?.trim() ?? "Guest").slice(0, 48);
  const parsed = profileSchema.safeParse({
    name, icon: profile?.avatar_icon ?? "Person", color: profile?.avatar_color ?? "stone", image: profile?.avatar_image ?? undefined,
  });
  let providerImage: string | undefined;
  if (!profile?.hide_provider_avatar && !profile?.avatar_image && typeof metadata?.picture === "string") {
    try {
      const url = new URL(metadata.picture);
      if (url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com" && !url.username && !url.password && !url.port) providerImage = url.href;
    } catch { /* Use the preset avatar when the provider picture is invalid. */ }
  }
  return { ...(parsed.data ?? { ...defaultProfile, name }), providerImage };
}

export async function prepareAvatar(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 5_000_000) {
    throw new Error("Choose a PNG, JPEG, or WebP image up to 5 MB.");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const header = new TextDecoder().decode(bytes);
  const valid = (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (file.type === "image/png" && bytes[0] === 137 && header.slice(1, 4) === "PNG") ||
    (file.type === "image/webp" && header.startsWith("RIFF") && header.slice(8, 12) === "WEBP");
  if (!valid) throw new Error("The file does not match its image format. Choose a PNG, JPEG, or WebP.");
  const image = await createImageBitmap(file).catch(() => { throw new Error("This image could not be opened. Choose another file."); });
  try {
    if (image.width * image.height > 24_000_000) throw new Error("Choose an image under 24 megapixels.");
    const side = Math.min(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser couldn’t prepare the image.");
    context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/webp", .9);
  } finally { image.close(); }
}
