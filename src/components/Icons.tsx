import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function ArchiveIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 7h16v13H4zM3 4h18v3H3zM8 11h8" /></IconBase>;
}

export function CalendarIcon(props: IconProps) {
  return <IconBase {...props}><path d="M5 4v3M19 4v3M3 9h18M4 6h16v15H4z" /></IconBase>;
}

export function ChevronRightIcon(props: IconProps) {
  return <IconBase {...props}><path d="m9 18 6-6-6-6" /></IconBase>;
}

export function ChevronDownIcon(props: IconProps) {
  return <IconBase {...props}><path d="m6 9 6 6 6-6" /></IconBase>;
}

export function ChevronLeftIcon(props: IconProps) {
  return <IconBase {...props}><path d="m15 18-6-6 6-6" /></IconBase>;
}

export function DeleteIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></IconBase>;
}

export function UploadIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 16V4m0 0L7 9m5-5 5 5M4 15v5h16v-5" /></IconBase>;
}

export function FolderIcon(props: IconProps) {
  return <IconBase {...props}><path d="M3 6h7l2 2h9v11H3z" /></IconBase>;
}

export function BookIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23zM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z" /></IconBase>;
}

export function SparkIcon(props: IconProps) {
  return <IconBase {...props}><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z" /></IconBase>;
}

export function RefreshIcon(props: IconProps) {
  return <IconBase {...props}><path d="M20 7v5h-5M4 17v-5h5M6.1 8a7 7 0 0 1 11.3-2.1L20 8M4 16l2.6 2.1A7 7 0 0 0 17.9 16" /></IconBase>;
}

export function SettingsIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></IconBase>;
}

export function CheckIcon(props: IconProps) {
  return <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>;
}

export function AlertIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 3 2.5 20h19zM12 9v4M12 17h.01" /></IconBase>;
}

export function SpinnerIcon(props: IconProps) {
  return <IconBase {...props}><path d="M21 12a9 9 0 1 1-6.2-8.6" /></IconBase>;
}

export function MenuIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16" /></IconBase>;
}

export function DownloadIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 19h16" /></IconBase>;
}

export function SaveIcon(props: IconProps) {
  return <IconBase {...props}><path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-7h8v7" /></IconBase>;
}
