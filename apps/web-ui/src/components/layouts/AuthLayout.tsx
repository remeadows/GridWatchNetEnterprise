import { Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/auth";

export function AuthLayout() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-900">
      {/* Full-page ninja background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url(/assets/NetNNJA1.jpg)",
        }}
      />
      {/* Dark overlay to fade the background image */}
      <div className="absolute inset-0 bg-dark-900/80" />

      {/* Cyberpunk background effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-cyber-gradient opacity-60" />
        <div className="absolute inset-0 bg-cyber-glow" />
        {/* Grid overlay effect */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0, 212, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.1) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md p-8">
        <Outlet />
      </div>
    </div>
  );
}
