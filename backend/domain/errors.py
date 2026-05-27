class SessionNotFoundError(KeyError):
    """Raised when a requested session does not exist."""


class MaxSessionReachedError(RuntimeError):
    """Raised when the server has reached the allowed session limit."""


class UnsupportedMessageTypeError(ValueError):
    """Raised when a message request uses an unsupported type."""
