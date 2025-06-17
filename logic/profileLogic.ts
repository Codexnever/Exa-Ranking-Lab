import { useState, useEffect } from "react"
import { toast } from "sonner"

export type AccessLog = {
  action: string;
  timestamp: string | Date;
  details?: Record<string, any>;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  lastActive: Date;
};

export function useProfileLogic(user: any, updateProfile: any, logout: any) {
  const [loading, setLoading] = useState(false)
  const [profileData, setProfileData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    avatar: "",
  })
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  useEffect(() => {
    if (user) {
      setAccessLogs([])
      loadTeamMembers()
    }
    // eslint-disable-next-line
  }, [user])

  const loadTeamMembers = async () => {
    setTeamMembers([
      {
        id: "1",
        name: user?.name || "You",
        email: user?.email || "",
        role: "Owner",
        avatar: "",
        lastActive: new Date(),
      },
    ])
  }

  const handleUpdateProfile = async (data: { name: string; email: string; avatar: string }) => {
    setLoading(true)
    try {
      await updateProfile(data)
      toast.success("Profile updated successfully!")
    } catch (error) {
      toast.error("Failed to update profile")
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
      toast.success("Logged out successfully")
    } catch (error) {
      toast.error("Failed to logout")
    }
  }

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
  }

  return {
    loading,
    profileData,
    setProfileData,
    accessLogs,
    teamMembers,
    handleUpdateProfile,
    handleLogout,
    formatDate,
    getInitials,
  }
}
