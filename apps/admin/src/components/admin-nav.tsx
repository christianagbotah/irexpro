import Link from 'next/link';

const NAV = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/brokers', label: 'Brokers' },
  { href: '/admin/audit', label: 'Audit Log' },
];

export default function AdminNav() {
  return (
    <nav>
      {NAV.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
