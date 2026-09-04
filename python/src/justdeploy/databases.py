from __future__ import annotations

import builtins
import math
from collections.abc import Sequence
from typing import cast

from ._transport import AsyncTransport, SyncTransport
from ._validation import path_segment
from .errors import JustDeployValidationError
from .types import CreateTableInput, Database, JsonPrimitive, QueryResult, Table, UpdateTableInput


def _query_body(sql: str, params: Sequence[JsonPrimitive] | None) -> dict[str, object]:
    if not isinstance(sql, str) or not sql.strip():
        raise JustDeployValidationError("sql must be a non-empty string.")
    if params is None:
        return {"query": sql}
    message = "params must be a sequence of strings, finite numbers, booleans, or None. Use strings for large integers and exact decimals."
    if not isinstance(params, Sequence) or isinstance(params, (str, bytes, bytearray)):
        raise JustDeployValidationError(message)
    values: builtins.list[JsonPrimitive] = []
    for value in params:
        if (
            value is None
            or isinstance(value, (str, bool))
            or (isinstance(value, int) and abs(value) <= 2**53 - 1)
            or (isinstance(value, float) and math.isfinite(value) and (not value.is_integer() or abs(value) <= 2**53 - 1))
        ):
            values.append(value)
        else:
            raise JustDeployValidationError(message)
    return {"query": sql, "params": values}


class Databases:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def list(self) -> builtins.list[Database]:
        result = cast(dict[str, builtins.list[Database]], self._transport.organization_request("GET", "/databases"))
        return result["databases"]

    def query(self, database_id: str, sql: str, *, params: Sequence[JsonPrimitive] | None = None) -> QueryResult:
        """Execute one statement; separate calls do not share a transaction.

        Pass user values in params for ? placeholders, never identifiers or SQL fragments.
        """
        body = _query_body(sql, params)
        return cast(
            QueryResult,
            self._transport.organization_request(
                "POST",
                f"/databases/{path_segment(database_id, 'database_id')}/query",
                json_body=body,
            ),
        )

    def list_tables(self, database_id: str) -> builtins.list[Table]:
        result = cast(
            dict[str, builtins.list[Table]],
            self._transport.organization_request("GET", f"/databases/{path_segment(database_id, 'database_id')}/tables"),
        )
        return result["tables"]

    def create_table(self, database_id: str, input: CreateTableInput) -> Table:
        result = cast(
            dict[str, Table],
            self._transport.organization_request(
                "POST",
                f"/databases/{path_segment(database_id, 'database_id')}/tables",
                json_body=input,
            ),
        )
        return result["table"]

    def update_table(self, database_id: str, table_name: str, input: UpdateTableInput) -> Table:
        result = cast(
            dict[str, Table],
            self._transport.organization_request(
                "PUT",
                f"/databases/{path_segment(database_id, 'database_id')}/tables/{path_segment(table_name, 'table_name')}",
                json_body=input,
            ),
        )
        return result["table"]

    def delete_table(self, database_id: str, table_name: str) -> None:
        self._transport.organization_request(
            "DELETE",
            f"/databases/{path_segment(database_id, 'database_id')}/tables/{path_segment(table_name, 'table_name')}",
        )


class AsyncDatabases:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def list(self) -> builtins.list[Database]:
        result = cast(dict[str, builtins.list[Database]], await self._transport.organization_request("GET", "/databases"))
        return result["databases"]

    async def query(self, database_id: str, sql: str, *, params: Sequence[JsonPrimitive] | None = None) -> QueryResult:
        """Async Databases.query: same bound-value and independent-statement contract."""
        body = _query_body(sql, params)
        return cast(
            QueryResult,
            await self._transport.organization_request(
                "POST",
                f"/databases/{path_segment(database_id, 'database_id')}/query",
                json_body=body,
            ),
        )

    async def list_tables(self, database_id: str) -> builtins.list[Table]:
        result = cast(
            dict[str, builtins.list[Table]],
            await self._transport.organization_request("GET", f"/databases/{path_segment(database_id, 'database_id')}/tables"),
        )
        return result["tables"]

    async def create_table(self, database_id: str, input: CreateTableInput) -> Table:
        result = cast(
            dict[str, Table],
            await self._transport.organization_request(
                "POST",
                f"/databases/{path_segment(database_id, 'database_id')}/tables",
                json_body=input,
            ),
        )
        return result["table"]

    async def update_table(self, database_id: str, table_name: str, input: UpdateTableInput) -> Table:
        result = cast(
            dict[str, Table],
            await self._transport.organization_request(
                "PUT",
                f"/databases/{path_segment(database_id, 'database_id')}/tables/{path_segment(table_name, 'table_name')}",
                json_body=input,
            ),
        )
        return result["table"]

    async def delete_table(self, database_id: str, table_name: str) -> None:
        await self._transport.organization_request(
            "DELETE",
            f"/databases/{path_segment(database_id, 'database_id')}/tables/{path_segment(table_name, 'table_name')}",
        )
