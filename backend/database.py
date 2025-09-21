import sqlite3
import json
from datetime import datetime
from typing import Dict, List, Any, Optional


class ResearchDatabase:
    """SQLite database manager for research data."""

    def __init__(self, db_path: str = "research.db"):
        """Initialize database connection and create tables."""
        self.db_path = db_path
        self.init_database()

    def init_database(self):
        """Initialize the database and create tables if they don't exist."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Create research table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS research (
                    researchID INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    thumbnail TEXT,
                    keywords TEXT,  -- JSON string array
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """
            )

            # Create research_details table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS research_details (
                    researchID INTEGER PRIMARY KEY,
                    details TEXT NOT NULL,  -- JSON object from final result tool
                    logs TEXT NOT NULL,     -- JSON object with chat history
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (researchID) REFERENCES research (researchID)
                )
            """
            )

            conn.commit()

    def insert_research(
        self, title: str, thumbnail: str = "", keywords: List[str] = None
    ) -> int:
        """Insert a new research entry and return the researchID."""
        if keywords is None:
            keywords = []

        # Convert keywords list to JSON string
        keywords_json = json.dumps(keywords)

        # Get current timestamp
        now = datetime.utcnow().isoformat()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            cursor.execute(
                """
                INSERT INTO research (title, thumbnail, keywords, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            """,
                (title, thumbnail, keywords_json, now, now),
            )

            research_id = cursor.lastrowid
            conn.commit()

            return research_id

    def update_research(
        self,
        research_id: int,
        title: str = None,
        thumbnail: str = None,
        keywords: List[str] = None,
    ):
        """Update an existing research entry."""
        # Get current timestamp for updated_at
        now = datetime.utcnow().isoformat()

        # Build update query dynamically
        update_fields = []
        values = []

        if title is not None:
            update_fields.append("title = ?")
            values.append(title)

        if thumbnail is not None:
            update_fields.append("thumbnail = ?")
            values.append(thumbnail)

        if keywords is not None:
            keywords_json = json.dumps(keywords)
            update_fields.append("keywords = ?")
            values.append(keywords_json)

        if not update_fields:
            return  # Nothing to update

        update_fields.append("updated_at = ?")
        values.append(now)
        values.append(research_id)  # For WHERE clause

        query = f"""
            UPDATE research
            SET {", ".join(update_fields)}
            WHERE researchID = ?
        """

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, values)
            conn.commit()

    def get_research(self, research_id: int) -> Optional[Dict[str, Any]]:
        """Get a research entry by ID."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM research WHERE researchID = ?", (research_id,)
            )

            row = cursor.fetchone()
            if row:
                return {
                    "researchID": row[0],
                    "title": row[1],
                    "thumbnail": row[2],
                    "keywords": json.loads(row[3]) if row[3] else [],
                    "created_at": row[4],
                    "updated_at": row[5],
                }
            return None

    def list_research(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List research entries with pagination."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM research
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            """,
                (limit, offset),
            )

            rows = cursor.fetchall()
            return [
                {
                    "researchID": row[0],
                    "title": row[1],
                    "thumbnail": row[2],
                    "keywords": json.loads(row[3]) if row[3] else [],
                    "created_at": row[4],
                    "updated_at": row[5],
                }
                for row in rows
            ]

    def insert_research_details(
        self, research_id: int, details: Dict[str, Any], logs: List[Dict[str, Any]]
    ) -> bool:
        """Insert research details and logs for a research entry."""
        # Convert details and logs to JSON strings
        details_json = json.dumps(details)
        logs_json = json.dumps(logs)

        # Get current timestamp
        now = datetime.utcnow().isoformat()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            try:
                cursor.execute(
                    """
                    INSERT INTO research_details (researchID, details, logs, created_at)
                    VALUES (?, ?, ?, ?)
                """,
                    (research_id, details_json, logs_json, now),
                )
                conn.commit()
                return True
            except sqlite3.IntegrityError:
                # If researchID already exists, update instead
                return self.update_research_details(research_id, details, logs)

    def update_research_details(
        self,
        research_id: int,
        details: Dict[str, Any] = None,
        logs: List[Dict[str, Any]] = None,
    ) -> bool:
        """Update research details and/or logs for a research entry."""
        # Get current timestamp for updated_at (we'll add this column later if needed)
        now = datetime.utcnow().isoformat()

        # Build update query dynamically
        update_fields = []
        values = []

        if details is not None:
            details_json = json.dumps(details)
            update_fields.append("details = ?")
            values.append(details_json)

        if logs is not None:
            logs_json = json.dumps(logs)
            update_fields.append("logs = ?")
            values.append(logs_json)

        if not update_fields:
            return False  # Nothing to update

        # Note: We don't have updated_at column in research_details table yet
        # This could be added later if needed

        values.append(research_id)  # For WHERE clause

        query = f"""
            UPDATE research_details
            SET {", ".join(update_fields)}
            WHERE researchID = ?
        """

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, values)
            conn.commit()
            return cursor.rowcount > 0

    def get_research_details(self, research_id: int) -> Optional[Dict[str, Any]]:
        """Get research details and logs by research ID."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM research_details WHERE researchID = ?", (research_id,)
            )

            row = cursor.fetchone()
            if row:
                return {
                    "researchID": row[0],
                    "details": json.loads(row[1]) if row[1] else {},
                    "logs": json.loads(row[2]) if row[2] else [],
                    "created_at": row[3],
                }
            return None

    def get_full_research(self, research_id: int) -> Optional[Dict[str, Any]]:
        """Get complete research data including details and logs."""
        research = self.get_research(research_id)
        if not research:
            return None

        details = self.get_research_details(research_id)
        if details:
            research["details"] = details["details"]
            research["logs"] = details["logs"]
            research["details_created_at"] = details["created_at"]

        return research


# Global database instance
db = ResearchDatabase()
