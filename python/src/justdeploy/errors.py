from collections.abc import Mapping
from typing import Any


class JustDeployError(Exception):
    """A safe, structured error returned by the SDK or the JustDeploy API."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        retry_after: int | None = None,
        request_id: str | None = None,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after
        self.request_id = request_id
        self.details = dict(details or {})


class JustDeployAuthenticationError(JustDeployError):
    """Authentication is absent, malformed, expired, or rejected."""


class JustDeployConfigurationError(JustDeployError):
    """The local SDK or deployment identity configuration is invalid."""


class JustDeployValidationError(JustDeployError):
    """A public SDK method received an invalid argument."""
