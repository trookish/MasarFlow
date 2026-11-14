import ClientPage from "./client-page";

export async function generateStaticParams() {
  return [{ agentId: "_" }];
}

export default function AgentDetailRoute() {
  return <ClientPage />;
}
