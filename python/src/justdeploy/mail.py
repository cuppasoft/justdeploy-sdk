from typing import cast

from ._transport import AsyncTransport, SyncTransport
from ._validation import page_query, path_segment
from .errors import JustDeployValidationError
from .types import Mail, MailPage


def _mail_request(
    *,
    from_address: str,
    to: str,
    subject: str,
    html: str | None,
    text: str | None,
    tag: str | None,
    idempotency_key: str | None,
) -> tuple[dict[str, str], dict[str, str]]:
    if idempotency_key is not None and (not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 256):
        raise JustDeployValidationError("idempotency_key must contain between 1 and 256 characters.")
    body = {"from": from_address, "to": to, "subject": subject}
    if html is not None:
        body["html"] = html
    if text is not None:
        body["text"] = text
    if tag is not None:
        body["tag"] = tag
    headers = {"idempotency-key": idempotency_key} if idempotency_key is not None else {}
    return body, headers


class MailClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def send(
        self,
        *,
        from_address: str,
        to: str,
        subject: str,
        html: str | None = None,
        text: str | None = None,
        tag: str | None = None,
        idempotency_key: str | None = None,
    ) -> Mail:
        body, headers = _mail_request(
            from_address=from_address,
            to=to,
            subject=subject,
            html=html,
            text=text,
            tag=tag,
            idempotency_key=idempotency_key,
        )
        result = cast(dict[str, Mail], self._transport.organization_request("POST", "/mails", json_body=body, headers=headers))
        return result["mail"]

    def list(self, *, limit: int | None = None, cursor: int | None = None) -> MailPage:
        return cast(MailPage, self._transport.organization_request("GET", f"/mails{page_query(limit=limit, cursor=cursor, max_limit=100)}"))

    def get(self, mail_id: str) -> Mail:
        result = cast(dict[str, Mail], self._transport.organization_request("GET", f"/mails/{path_segment(mail_id, 'mail_id')}"))
        return result["mail"]


class AsyncMailClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def send(
        self,
        *,
        from_address: str,
        to: str,
        subject: str,
        html: str | None = None,
        text: str | None = None,
        tag: str | None = None,
        idempotency_key: str | None = None,
    ) -> Mail:
        body, headers = _mail_request(
            from_address=from_address,
            to=to,
            subject=subject,
            html=html,
            text=text,
            tag=tag,
            idempotency_key=idempotency_key,
        )
        result = cast(dict[str, Mail], await self._transport.organization_request("POST", "/mails", json_body=body, headers=headers))
        return result["mail"]

    async def list(self, *, limit: int | None = None, cursor: int | None = None) -> MailPage:
        return cast(
            MailPage, await self._transport.organization_request("GET", f"/mails{page_query(limit=limit, cursor=cursor, max_limit=100)}")
        )

    async def get(self, mail_id: str) -> Mail:
        result = cast(dict[str, Mail], await self._transport.organization_request("GET", f"/mails/{path_segment(mail_id, 'mail_id')}"))
        return result["mail"]
