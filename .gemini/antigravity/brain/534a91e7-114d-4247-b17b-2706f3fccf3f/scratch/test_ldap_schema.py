from pydantic import BaseModel
from typing import Optional

class LdapConfigRequest(BaseModel):
    server:           str
    port:             int  = 389
    base_dn:          str  = ""
    bind_dn:          str  = ""
    bind_pw:          str  = ""
    user_filter:      str  = "(sAMAccountName={username})"
    attr_name:        str  = "cn"
    attr_email:       str  = "mail"
    role_admin_group: str  = ""
    use_ssl:          bool = False
    tls_verify:       bool = True

payload = {
    "server": "ldap://localhost",
    "port": 389,
    "base_dn": "",
    "bind_dn": "",
    "bind_pw": "",
    "user_filter": "(sAMAccountName={username})",
    "attr_name": "cn",
    "attr_email": "mail",
    "role_admin_group": "",
    "use_ssl": False,
    "tls_verify": True
}

try:
    LdapConfigRequest(**payload)
    print("Payload 1 OK")
except Exception as e:
    print(f"Payload 1 Error: {e}")

# Test with empty server
try:
    LdapConfigRequest(server="")
    print("Payload 2 (empty server) OK")
except Exception as e:
    print(f"Payload 2 (empty server) Error: {e}")

# Test with missing server
try:
    LdapConfigRequest()
    print("Payload 3 (missing server) OK")
except Exception as e:
    print(f"Payload 3 (missing server) Error: {e}")
