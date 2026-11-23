import Image from "next/image";
import { BookOpen, Camera, Cat, Coffee, Compass, Feather, Flower, Headphones, Heart, Leaf, Moon, Mountain, Music, Palette, Rocket, UserRound } from "lucide-react";
import { avatarColors, defaultProfile, type LocalProfile } from "../../../lib/profile";
import styles from "./account.module.css";

const icons = { Person: UserRound, Book: BookOpen, Leaf, Cat, Coffee, Moon, Mountain, Music, Heart, Headphones, Rocket, Compass, Camera, Flower, Feather, Palette };

export function ProfileAvatar({ profile = defaultProfile, size = 52 }: { profile?: LocalProfile; size?: number }) {
  const Icon = icons[profile.icon];
  const color = avatarColors.find(({ id }) => id === profile.color)?.value;
  return (
    <span className={styles.profileAvatar} style={{ width: size, height: size, backgroundColor: color }} aria-hidden="true">
      {profile.image || profile.providerImage ? <Image unoptimized src={profile.image ?? profile.providerImage!} width={size} height={size} referrerPolicy="no-referrer" alt="" /> : <Icon size={Math.round(size * .53)} />}
    </span>
  );
}
