import { redirect } from "next/navigation";

// ponytail: único calendário do MVP é o "ibc" — sem tela de listagem de
// calendários, redireciona direto. Revisitar se/quando houver mais de um.
export default function Home() {
  redirect("/c/ibc");
}
