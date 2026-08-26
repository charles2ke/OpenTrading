import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./app.js";

function AuthControls() {
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("./auth/session", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then(setUser)
      .catch(() => {});
  }, []);

  if (user) {
    return (
      <div className="signed-in">
        <div className="avatar" aria-label={`Signed in as ${user.name}`}>{user.name.slice(0, 2).toUpperCase()}</div>
        <form action="./auth/logout" method="post"><button className="text-button" type="submit">Sign out</button></form>
      </div>
    );
  }

  return (
    <div className="auth-menu">
      <button className="secondary-button" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Sign in</button>
      {open && <div className="auth-options">
        <a href="./auth/google">Continue with Google</a>
        <a href="./auth/microsoft">Continue with Microsoft</a>
      </div>}
    </div>
  );
}

createRoot(document.getElementById("auth-root")).render(<AuthControls />);
