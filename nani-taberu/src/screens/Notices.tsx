export default function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <ul className="notices">
      {notices.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}
