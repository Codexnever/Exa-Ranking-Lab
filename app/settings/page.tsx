"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsApiConfig } from "./SettingsApiConfig"
import { SettingsNotifications } from "./SettingsNotifications"
import { SettingsPreferences } from "./SettingsPreferences"
import { SettingsDataManagement } from "./SettingsDataManagement"
import { SettingsSecurity } from "./SettingsSecurity"

export default function SettingsPage() {
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
