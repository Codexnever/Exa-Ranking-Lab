export function getNotificationsCollectionId(): string {
  const collectionId = process.env.COLLECTION_NOTIFICATIONS?.trim()
  if (!collectionId) throw new Error("Notification storage is not configured")
  return collectionId
}

export function getNotificationEmailSender(): string | null {
  return process.env.NOTIFICATION_EMAIL_FROM?.trim() || null
}
