import { Bell, Gamepad2, HelpCircle, History, Home, Medal, Menu, Settings, Swords, Trophy, User, Users, Download, Crown, Shield } from "lucide-react";
export const PRIMARY_NAV = [
  { to: "/hub", label: "Hub", icon: Home },
  { to: "/sports", label: "Play", icon: Gamepad2 },
  { to: "/rankings", label: "Rankings", icon: Crown },
  { to: "/friends", label: "Friends", icon: Users },
] as const;

export const SECONDARY_NAV = [
  { to: "/profile", label: "Profile", icon: User },
  { to: "/invitations", label: "Invitations", icon: Swords },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/history", label: "Match history", icon: History },
  { to: "/achievements", label: "Achievements", icon: Medal },
  { to: "/tournaments", label: "Tournaments", icon: Trophy },
  { to: "/clubs", label: "Clubs", icon: Shield },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/install", label: "Install app", icon: Download },
  { to: "/help", label: "Help & support", icon: HelpCircle },
] as const;

export const MENU_ITEM = { to: "/menu", label: "More", icon: Menu } as const;
