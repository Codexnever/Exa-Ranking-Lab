"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "sonner"
import { User, Calendar, Activity, Users, Shield } from "lucide-react"
import { useProfileLogic } from "@/logic/profileLogic"

export default function ProfilePage() {
  const { user, updateProfile, logout } = useAuth()
  const {
    loading,
    profileData,
    setProfileData,
    accessLogs,
    teamMembers,
    handleUpdateProfile,
    handleLogout,
    formatDate,
    getInitials,
  } = useProfileLogic(user, updateProfile, logout)

  const handleProfileFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleUpdateProfile(profileData)
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Please sign in</h2>
          <p className="text-gray-600 mt-2">You need to be signed in to view your profile</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Profile</h1>
          <p className="text-gray-600 mt-1">Manage your account settings and preferences</p>
        </div>
        <Button variant="outline" onClick={handleLogout}>
          Sign Out
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <div className="overflow-hidden rounded-lg border">
            <div className="bg-white p-6">
              <h2 className="text-lg font-medium">Profile Information</h2>
              <p className="text-sm text-gray-500">
                Update your personal details and profile information
              </p>
            </div>
            <div className="bg-gray-50 p-6">
              <form onSubmit={handleProfileFormSubmit} className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profileData.avatar || "/placeholder.svg"} />
                    <AvatarFallback className="text-lg">
                      {getInitials(profileData.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Button variant="outline" size="sm">
                      Change Avatar
                    </Button>
                    <p className="text-xs text-gray-500 mt-1">
                      JPG, GIF or PNG. 1MB max.
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={profileData.name}
                      onChange={(e) =>
                        setProfileData({ ...profileData, name: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData({ ...profileData, email: e.target.value })
                      }
                      required
                      disabled
                    />
                    <p className="text-xs text-gray-500">
                      Email cannot be changed. Contact support if needed.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Account Information</Label>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="flex items-center gap-2 p-3 border rounded-lg">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Member Since</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(new Date(user.$createdAt))}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 border rounded-lg">
                      <Activity className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Account Status</p>
                        <Badge variant="default" className="text-xs">
                          Active
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={loading}>
                  {loading ? "Updating..." : "Update Profile"}
                </Button>
              </form>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <div className="overflow-hidden rounded-lg border">
            <div className="bg-white p-6">
              <h2 className="text-lg font-medium">Recent Activity</h2>
              <p className="text-sm text-gray-500">
                Your recent actions and system events
              </p>
            </div>
            <div className="bg-gray-50 p-6">
              <div className="space-y-4">
                {accessLogs.length > 0 ? (
                  accessLogs.map((log, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-3 border rounded-lg"
                    >
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {log.action.replace("_", " ").toUpperCase()}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDate(log.timestamp)}
                        </p>
                      </div>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {Object.keys(log.details).length} details
                        </Badge>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No recent activity</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-6">
          <div className="overflow-hidden rounded-lg border">
            <div className="bg-white p-6">
              <h2 className="text-lg font-medium">Team Members</h2>
              <p className="text-sm text-gray-500">
                Manage team access and permissions
              </p>
            </div>
            <div className="bg-gray-50 p-6">
              <div className="space-y-4">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 p-4 border rounded-lg"
                  >
                    <Avatar>
                      <AvatarImage src={member.avatar || "/placeholder.svg"} />
                      <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          member.role === "Owner" ? "default" : "secondary"
                        }
                      >
                        {member.role}
                      </Badge>
                      <p className="text-xs text-gray-500 mt-1">
                        Last active: {formatDate(member.lastActive)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-6" />

              <div className="space-y-4">
                <h3 className="font-medium">Invite Team Members</h3>
                <div className="flex gap-2">
                  <Input placeholder="Enter email address" />
                  <Button>Send Invite</Button>
                </div>
                <p className="text-xs text-gray-500">
                  Team members will have access to all queries and data in this
                  workspace.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div className="overflow-hidden rounded-lg border">
            <div className="bg-white p-6">
              <h2 className="text-lg font-medium">Security Settings</h2>
              <p className="text-sm text-gray-500">
                Manage your account security and authentication
              </p>
            </div>
            <div className="bg-gray-50 p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Password</h3>
                    <p className="text-sm text-gray-500">
                      Last changed 30 days ago
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Change Password
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-500">
                      Add an extra layer of security
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    Enable 2FA
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium">Active Sessions</h3>
                    <p className="text-sm text-gray-500">
                      Manage your active login sessions
                    </p>
                  </div>
                  <Button variant="outline" size="sm">
                    View Sessions
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium text-red-600">Danger Zone</h3>
                <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg">
                  <div>
                    <h4 className="font-medium">Delete Account</h4>
                    <p className="text-sm text-gray-500">
                      Permanently delete your account and all data
                    </p>
                  </div>
                  <Button variant="destructive" size="sm">
                    Delete Account
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
