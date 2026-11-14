import ClientPage from "./client-page";

export async function generateStaticParams() {
  return [{ specId: "_" }];
}

export default function SpecDetailRoute() {
  return <ClientPage />;
}
