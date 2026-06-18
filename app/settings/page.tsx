"use client"

import dynamic from "next/dynamic"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
const SettingsApiConfig = dynamic(() => import("@/components/settings/SettingsApiConfig").then(mod => mod.SettingsApiConfig), {
  loading: () => <SettingsApiConfigSkeleton />, ssr: false,
})
const SettingsNotifications = dynamic(() => import("@/components/settings/SettingsNotifications").then(mod => mod.SettingsNotifications), {
  loading: () => <SettingsNotificationsSkeleton />, ssr: false,
})
const SettingsPreferences = dynamic(() => import("@/components/settings/SettingsPreferences").then(mod => mod.SettingsPreferences), {
  loading: () => <SettingsPreferencesSkeleton />, ssr: false,
})
const SettingsDataManagement = dynamic(() => import("@/components/settings/SettingsDataManagement").then(mod => mod.SettingsDataManagement), {
  loading: () => <SettingsDataManagementSkeleton />, ssr: false,
})
const SettingsSecurity = dynamic(() => import("@/components/settings/SettingsSecurity").then(mod => mod.SettingsSecurity), {
  loading: () => <SettingsSecuritySkeleton />, ssr: false,
})
import SettingsApiConfigSkeleton from "@/components/loaders/SettingsApiConfigSkeleton"
import SettingsNotificationsSkeleton from "@/components/loaders/SettingsNotificationsSkeleton"
import SettingsPreferencesSkeleton from "@/components/loaders/SettingsPreferencesSkeleton"
import SettingsDataManagementSkeleton from "@/components/loaders/SettingsDataManagementSkeleton"
import SettingsSecuritySkeleton from "@/components/loaders/SettingsSecuritySkeleton"
import { useAuth } from "@/lib/middleware/authentication/auth-context"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"

export default function SettingsPage() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-1">Manage your account preferences and application settings</p>
        </div>
      </div>
      <Tabs defaultValue="api" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="api">API Configuration</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
        <TabsContent value="api" className="space-y-6">
          <SettingsApiConfig />
        </TabsContent>
        <TabsContent value="notifications" className="space-y-6">
          <SettingsNotifications />
        </TabsContent>
        <TabsContent value="preferences" className="space-y-6">
          <SettingsPreferences />
        </TabsContent>
        <TabsContent value="data" className="space-y-6">
          <SettingsDataManagement />
        </TabsContent>
        <TabsContent value="security" className="space-y-6">
          <SettingsSecurity />
        </TabsContent>
      </Tabs>
    </div>
  )
}
