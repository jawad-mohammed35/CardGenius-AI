import React from "react";

function Footer() {
  return (
    <footer className="w-full py-4">
      <div className="container px-4 md:px-6">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} CardGenius AI. All rights reserved. Developed by Jawad Mohammed.
        </p>
      </div>
    </footer>
  );
}

export default Footer;