#!/bin/bash
# PostgreSQL backup script for Odie platform
# Run via cron: 0 2 * * * /path/to/backup-postgres.sh

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/odie}"
CONTAINER_NAME="${CONTAINER_NAME:-odie-postgres}"
POSTGRES_USER="${POSTGRES_USER:-odie}"
POSTGRES_DB="${POSTGRES_DB:-odie_polymarket}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/odie_backup_$TIMESTAMP.sql.gz"

echo "Starting PostgreSQL backup..."
echo "Backup file: $BACKUP_FILE"

# Perform backup
docker exec "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    echo "Backup completed successfully"
    echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    echo "ERROR: Backup failed or file is empty"
    exit 1
fi

# Remove old backups
echo "Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "odie_backup_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

# List remaining backups
echo "Current backups:"
ls -lh "$BACKUP_DIR"/odie_backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo "Backup process complete"
