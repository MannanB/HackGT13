import json
from collections.abc import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import set_json_loads

from app.db import get_pool


def get_db() -> Iterator[psycopg.Connection]:
    """Yield a pooled connection for a single request."""
    with get_pool().connection() as conn:
        conn.row_factory = dict_row
        set_json_loads(json.loads, conn)
        yield conn
