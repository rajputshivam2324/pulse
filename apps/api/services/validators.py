"""
Input validation utilities for Pulse API.
Solana address validation and other security checks.
"""

import base58


def is_valid_solana_address(address: str) -> bool:
    """
    Validate a Solana public key / program address.
    Returns True only if the string decodes to exactly 32 bytes (Ed25519 pubkey).
    """
    if not address or not isinstance(address, str):
        return False
    try:
        decoded = base58.b58decode(address)
        return len(decoded) == 32
    except Exception:
        return False


def require_valid_address(address: str) -> None:
    """Raise ValueError if address is not a valid Solana address."""
    if not is_valid_solana_address(address):
        raise ValueError(f"Invalid Solana address format: {address}")