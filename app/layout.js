import { Inter } from "next/font/google";
import {
  ClerkProvider,

} from '@clerk/nextjs'
import './globals.css'
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "CardGenius AI",
  description: "Create, Generate, and Grow with CardGenius AI",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
  
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}