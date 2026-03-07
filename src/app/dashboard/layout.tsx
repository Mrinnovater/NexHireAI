
'use client';

import { Sidebar, SidebarProvider } from "@/components/ui/sidebar";
import { LayoutDashboard, History, Trophy, Bot, Star, BookOpen, User, Bell, Briefcase } from "lucide-react";
import { SidebarButton } from "@/components/dashboard/SidebarButton";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const candidateNavItems = [
  { href: "/dashboard", icon: <LayoutDashboard />, label: "Overview" },
  { href: "/dashboard/applications", icon: <Briefcase />, label: "My Applications" },
  { href: "/dashboard/assessments", icon: <History />, label: "Assessments" },
  { href: "/dashboard/notifications", icon: <Bell />, label: "Notifications" },
  { href: "/dashboard/gamification", icon: <Trophy />, label: "Gamification" },
  { href: "/dashboard/job-recommender", icon: <Bot />, label: "AI Job Recommender" },
  { href: "/dashboard/skill-master", icon: <Star />, label: "AI Skill Master" },
  { href: "/dashboard/learning", icon: <BookOpen />, label: "AI Learning" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const router = useRouter();

  // This layout is ONLY for candidates.
  // Redirect if the user is not a candidate or is not logged in.
  useEffect(() => {
     if (!isLoading) {
        if (!user) {
            router.push('/login');
        } else if (user.role !== 'candidate') {
            router.push('/admin');
        }
     }
  }, [user, isLoading, router]);

  // Show a loading state while we verify the user role
  if (isLoading || !user || user.role !== 'candidate') {
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
                        {candidateNavItems.map((item) => (
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
                    <SidebarButton
                        href="/profile/me"
                        icon={<User />}
                        label="Profile"
                        isActive={pathname.startsWith('/profile')}
                        tooltip="Profile"
                    />
                </div>
            </div>
        </Sidebar>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </SidebarProvider>
  );
}
