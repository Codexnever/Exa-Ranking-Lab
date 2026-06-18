#!/bin/bash
echo "Clearing Next.js cache..."
rm -rf .next
rm -rf node_modules/.cache
echo "Cache cleared. Please restart your dev server."
