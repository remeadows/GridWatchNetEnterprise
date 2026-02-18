import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Alert } from "@gridwatch/shared-ui";
import { useAuthStore } from "../../stores/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await login(username, password);
      navigate("/dashboard");
    } catch {
      // Error is handled in store
    }
  };

  return (
    <div className="cyber-card p-8">
      {/* Logo and Brand */}
      <div className="mb-8 flex flex-col items-center">
        <img
          src="/assets/GridWatchLogo.png"
          alt="GridWatch Logo"
          className="h-20 w-20 rounded-xl object-cover shadow-neon-blue"
        />
        <h1 className="mt-4 text-2xl font-bold text-primary-500">
          GridWatch NetEnterprise
        </h1>
        <p className="mt-1 text-sm text-silver-400">
          Network Management Platform
        </p>
      </div>

      <h2 className="mb-6 text-center text-xl font-semibold text-white">
        Sign in to your account
      </h2>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          required
          autoComplete="username"
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
          autoComplete="current-password"
        />

        <Button type="submit" className="w-full" loading={isLoading}>
          Sign in
        </Button>
      </form>

      {/* Version info */}
      <p className="mt-6 text-center text-xs text-silver-500">Version 0.3.0</p>
    </div>
  );
}
