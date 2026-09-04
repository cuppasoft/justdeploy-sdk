from typing import cast

from ._transport import AsyncTransport, SyncTransport
from ._validation import page_query, path_segment
from .errors import JustDeployValidationError
from .types import Mail, MailPage


def _mail_request(
    *,
    sender: str,
    to: str,
    subject: str,
    html: str | None,
    text: str | None,
    tag: str | None,
    idempotency_key: str | None,
) -> tuple[dict[str, str], dict[str, str]]:
    if idempotency_key is not None and (not isinstance(idempotency_key, str) or not 1 <= len(idempotency_key) <= 256):
        raise JustDeployValidationError("idempotency_key must contain between 1 and 256 characters.")
    body = {"from": sender, "to": to, "subject": subject}
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
        sender: str,
        to: str,
        subject: str,
        html: str | None = None,
        text: str | None = None,
        tag: str | None = None,
        idempotency_key: str | None = None,
    ) -> Mail:
        """Send one message; sender maps to the REST request and result field from.

        Retry a logical message with the same idempotency_key and payload.
        New actions, including another password reset, need new keys; changed
        content with the same key is rejected with 409. Keys are not generated.
        HTML messages currently include an open-tracking image, with no opt-out input.
        """
        body, headers = _mail_request(
            sender=sender,
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
        sender: str,
        to: str,
        subject: str,
        html: str | None = None,
        text: str | None = None,
        tag: str | None = None,
        idempotency_key: str | None = None,
    ) -> Mail:
        """Async MailClient.send: same sender, idempotency, and tracking rules."""
        body, headers = _mail_request(
            sender=sender,
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
