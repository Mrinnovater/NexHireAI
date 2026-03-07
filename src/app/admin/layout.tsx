
'use client';

import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { LayoutDashboard, Users, NotebookPen, ShieldCheck, BarChart, FolderKanban, Settings, User, Mic } from "lucide-react";
import { SidebarButton } from "@/components/dashboard/SidebarButton";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/landing/header";

const adminNavItems = [
  { href: "/admin", icon: <LayoutDashboard />, label: "Overview" },
  { href: "/admin/candidates", icon: <Users />, label: "Candidates" },
  { href: "/admin/assessments", icon: <NotebookPen />, label: "Assessments" },
  { href: "/admin/roles", icon: <ShieldCheck />, label: "Roles & Skills" },
  { href: "/admin/pipeline", icon: <FolderKanban />, label: "Pipeline" },
  { href: "/admin/jobs/new", icon: <Mic />, label: "Interview Setup" },
];

const adminSettingsItems = [
    { href: "/admin/settings", icon: <Settings />, label: "Settings" },
    { href: "/admin/profile", icon: <User />, label: "Profile" },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
     if (!isLoading) {
        if (!user) {
            router.push('/login');
        } else if (user.role === 'candidate') {
            // If a candidate somehow lands here, push them to their dashboard
            router.push('/dashboard');
        }
     }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role === 'candidate') {
      return (
        <div className="flex items-center justify-center h-screen w-full">
            <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )
  }
  
  return (
    <SidebarProvider>
      <div className="flex flex-row flex-grow overflow-hidden">
        <Sidebar onHover="expand">
            <div className="flex h-full flex-col p-2">
                <div className="flex-1 overflow-y-auto">
                    <div className="flex flex-col gap-2">
                        {adminNavItems.map((item) => (
                        <SidebarButton
                            key={item.href}
                            href={item.href}
                            icon={item.icon}
                            label={item.label}
                            isActive={pathname === item.href}
                            tooltip={item.label}
                        />
                        ))}
                    </div>
                </div>
                <div className="mt-auto">
                    {adminSettingsItems.map((item) => (
                         <SidebarButton
                            key={item.href}
                            href={item.href}
                            icon={item.icon}
                            label={item.label}
                            isActive={pathname.startsWith(item.href)}
                            tooltip={item.label}
                        />
                    ))}
                </div>
            </div>
        </Sidebar>
        <div className="flex flex-col flex-grow">
            <Header />
            <main className="flex-1 overflow-y-auto bg-secondary/50">
                {children}
            </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
