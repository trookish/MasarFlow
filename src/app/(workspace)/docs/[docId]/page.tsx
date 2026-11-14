import ClientPage from "./client-page";

export async function generateStaticParams() {
  return [{ docId: "_" }];
}

export default function DocDetailRoute() {
  return <ClientPage />;
}
