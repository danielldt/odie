#!/bin/bash
# PostgreSQL restore script for Odie platform
# Usage: ./restore-postgres.sh /path/to/backup.sql.gz

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="${CONTAINER_NAME:-odie-postgres}"
POSTGRES_USER="${POSTGRES_USER:-odie}"
POSTGRES_DB="${POSTGRES_DB:-odie_polymarket}"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "WARNING: This will drop and recreate the database!"
echo "Database: $POSTGRES_DB"
echo "Backup file: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo "Stopping dependent services..."
docker stop odie-api odie-worker 2>/dev/null || true

echo "Dropping and recreating database..."
docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"
docker exec "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -c "CREATE DATABASE $POSTGRES_DB;"

echo "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Starting services..."
docker start odie-api odie-worker 2>/dev/null || true

echo "Restore complete!"
