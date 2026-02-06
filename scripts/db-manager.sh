#!/bin/bash
# Database backup and restore utility

set -e

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)
COMPOSE="docker compose"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

usage() {
    echo "Database Management Utility"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  backup              Create database backup"
    echo "  restore <file>      Restore from backup file"
    echo "  list                List available backups"
    echo "  init                Initialize database with schema"
    echo "  shell               Open MySQL shell"
    echo "  status              Check database status"
    echo ""
}

backup() {
    echo -e "${YELLOW}Creating database backup...${NC}"
    mkdir -p "$BACKUP_DIR"
    
    BACKUP_FILE="$BACKUP_DIR/sowwwl_${DATE}.sql"
    
    $COMPOSE exec -T db mysqldump \
        -u sowwwl \
        -psowwwlpass \
        --single-transaction \
        --quick \
        --lock-tables=false \
        sowwwl > "$BACKUP_FILE"
    
    echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"
    echo -e "  Size: $(du -h "$BACKUP_FILE" | cut -f1)"
}

restore() {
    if [ -z "$1" ]; then
        echo -e "${RED}Error: Backup file not specified${NC}"
        echo "Usage: $0 restore <backup-file>"
        exit 1
    fi
    
    if [ ! -f "$1" ]; then
        echo -e "${RED}Error: File not found: $1${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Restoring database from: $1${NC}"
    read -p "This will overwrite the current database. Continue? (y/N) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Restore cancelled"
        exit 0
    fi
    
    $COMPOSE exec -T db mysql \
        -u sowwwl \
        -psowwwlpass \
        sowwwl < "$1"
    
    echo -e "${GREEN}✓ Database restored successfully${NC}"
}

list_backups() {
    echo "Available backups in $BACKUP_DIR:"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
        echo "  No backups found"
        return
    fi
    
    ls -lh "$BACKUP_DIR"/*.sql 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
}

init_db() {
    echo -e "${YELLOW}Initializing database with schema...${NC}"
    
    if [ ! -f "sowwwl-api-php/schema.sql" ]; then
        echo -e "${RED}Error: schema.sql not found${NC}"
        exit 1
    fi
    
    $COMPOSE exec -T db mysql \
        -u sowwwl \
        -psowwwlpass \
        sowwwl < sowwwl-api-php/schema.sql
    
    echo -e "${GREEN}✓ Database initialized${NC}"
}

db_shell() {
    echo -e "${YELLOW}Opening MySQL shell...${NC}"
    $COMPOSE exec db mysql -u sowwwl -psowwwlpass sowwwl
}

status() {
    echo -e "${YELLOW}Checking database status...${NC}"
    echo ""
    
    # Check if container is running
    if ! $COMPOSE ps db | grep -q "Up"; then
        echo -e "${RED}✗ Database container is not running${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Database container is running${NC}"
    
    # Get database info
    echo ""
    echo "Database info:"
    $COMPOSE exec db mysql -u sowwwl -psowwwlpass sowwwl -e "
        SELECT 
            'Tables' as Metric, 
            COUNT(*) as Value 
        FROM information_schema.tables 
        WHERE table_schema = 'sowwwl'
        UNION ALL
        SELECT 
            'Users' as Metric,
            COUNT(*) as Value
        FROM users;
    " 2>/dev/null || echo "  Could not retrieve database info"
}

# Main
case "$1" in
    backup)
        backup
        ;;
    restore)
        restore "$2"
        ;;
    list)
        list_backups
        ;;
    init)
        init_db
        ;;
    shell)
        db_shell
        ;;
    status)
        status
        ;;
    *)
        usage
        exit 1
        ;;
esac
