import ClientPage from "./client-page";

export async function generateStaticParams() {
  return [{ noteId: "_" }];
}

export default function NoteDetailRoute() {
  return <ClientPage />;
}
