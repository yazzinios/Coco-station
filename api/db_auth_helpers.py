"""
db_auth_helpers.py — CocoStation
──────────────────────────────────────────────────────────────
Authentication-specific DB helpers that complement db_client.py.
These use the shared connection pool from the DBClient instance.
"""

import os
import json
from typing import Optional


def get_user_by_username(db_instance, username: str) -> Optional[dict]:
    """
    Fetch a single user row by username using the shared DB pool.
    Returns None if not found. Never raises.
    """
    conn = None
    try:
        conn = db_instance._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, username, display_name,
                    password_hash, role, is_super_admin,
                    COALESCE(enabled, TRUE) AS enabled
                FROM users
                WHERE username = %s
                LIMIT 1
                """,
                (username,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return dict(row)
    except Exception as e:
        print(f"[db_auth] get_user_by_username({username!r}) failed: {e}")
        return None
    finally:
        db_instance._put_conn(conn)


def update_last_login(db_instance, user_id: str) -> None:
    """
    Stamp the last_login timestamp for a user after successful authentication.
    Fire-and-forget — never raises.
    """
    conn = None
    try:
        conn = db_instance._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET last_login = NOW() WHERE id = %s",
                (user_id,),
            )
    except Exception as e:
        print(f"[db_auth] update_last_login({user_id!r}) failed: {e}")
    finally:
        db_instance._put_conn(conn)


def get_user_by_id(db_instance, user_id: str) -> Optional[dict]:
    """
    Fetch a single user row by UUID. Returns None if not found.
    Used for token refresh validation.
    """
    conn = None
    try:
        conn = db_instance._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id::text, username, display_name,
                    role, is_super_admin,
                    COALESCE(enabled, TRUE) AS enabled
                FROM users
                WHERE id = %s
                LIMIT 1
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return dict(row)
    except Exception as e:
        print(f"[db_auth] get_user_by_id({user_id!r}) failed: {e}")
        return None
    finally:
        db_instance._put_conn(conn)
