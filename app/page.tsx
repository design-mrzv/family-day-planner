import { getSession } from "@/lib/auth/getSession";
import LoginForm from "./LoginForm";
import Planner from "./Planner";

export default async function Home() {
  const session = await getSession();
  return session ? <Planner /> : <LoginForm />;
}
