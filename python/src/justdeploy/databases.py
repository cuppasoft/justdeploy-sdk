from __future__ import annotations

import builtins
from typing import cast

from ._transport import AsyncTransport, SyncTransport
from ._validation import path_segment
from .errors import JustDeployValidationError
from .types import CreateTableInput, Database, QueryResult, Table, UpdateTableInput


class Databases:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def list(self) -> builtins.list[Database]:
        result = cast(dict[str, builtins.list[Database]], self._transport.organization_request("GET", "/databases"))
        return result["databases"]

    def query(self, database_id: str, sql: str) -> QueryResult:
        if not isinstance(sql, str) or not sql.strip():
            raise JustDeployValidationError("sql must be a non-empty string.")
        return cast(
            QueryResult,
            self._transport.organization_request(
                "POST",
                f"/databases/{path_segment(database_id, 'database_id')}/query",
                json_body={"query": sql},
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

    async def query(self, database_id: str, sql: str) -> QueryResult:
        if not isinstance(sql, str) or not sql.strip():
            raise JustDeployValidationError("sql must be a non-empty string.")
        return cast(
            QueryResult,
            await self._transport.organization_request(
                "POST",
                f"/databases/{path_segment(database_id, 'database_id')}/query",
                json_body={"query": sql},
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
