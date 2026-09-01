import { PasswordGate } from "../components/PasswordGate";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  return <PasswordGate onSubmit={login} />;
}
