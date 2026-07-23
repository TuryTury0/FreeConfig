'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items: [string, string][] = [
  ['Explorer', '/explorer'],
  ['Tester', '/tester'],
  ['Testing', '/testing'],
  ['Sources', '/sources'],
];

export function Navigation() {
  const path = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b line bg-[#080808]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/sources" className="text-base font-bold tracking-[-.06em]">
          Any<span className="text-zinc-500">things</span>
          <sup className="ml-1 text-[8px] tracking-normal text-zinc-500">by TUry</sup>
        </Link>

        <nav className="flex gap-1">
          {items.map(([name, href]) => (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-3 py-1.5 text-xs transition ${
                path === href
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}