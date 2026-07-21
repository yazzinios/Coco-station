# Roles and Users Redesign Plan

This document outlines the implementation plan for deleting the `/roles` configuration page, redesigning the users management page, securing the super-user accounts, and simplifying LDAP authentication so that new domain users default to the lowest privilege (`viewer`) and require explicit manual authorization by a super-admin.

---

## 1. Goal and Objectives

- **Delete `/roles` page**: Remove the dedicated roles mapping and custom roles creation UI.
- **Redesign Users Management**: Simplify the user manager to focus on local/LDAP user lists, roles assignment, and per-user permission overrides.
- **Super-User Protection**: Lock the primary super-user account (`cocoadmin` / `is_super_admin = True`) so it is immutable and cannot be updated, disabled, or deleted by anyone (including other admins or themselves).
- **Wipe Existing Users**: Truncate all existing users except the system super-user `cocoadmin`.
- **Simplify LDAP Authentication**:
  - Delete all group-to-role mappings and database lookup logic.
  - New LDAP users will be provisioned in the database with a default role of `'viewer'` (the lowest privilege) upon their first successful login.
  - Subsequent LDAP logins will preserve whatever role or custom permissions the super-user manually assigned, instead of overriding them from LDAP groups.
- **Expose All App Functionality as Permissions**: Map and list every system capability to make granular user overriding simple and robust.

---

## 2. Listing App Functionality (Permissions & Roles Catalog)

The application has the following functional modules and actions, which map directly to permissions:

### System Roles
We will support **4 built-in system roles**:

1. **Super Admin** (`super_admin`):
   - Full, unrestricted access to all modules, decks, actions, and settings.
   - **Immutable**: Cannot be deleted or modified.
2. **Admin** (`admin`):
   - Access to user management (except super-users) and content modules.
   - Cannot modify system settings (`can_settings = False`).
3. **Operator** (`operator`):
   - Full control over music playback, playlists, announcements, and schedules.
   - Cannot manage users or system settings.
4. **Viewer** (`viewer`):
   - Read-only access to decks and playlists.
   - Cannot change tracks, trigger announcements, edit schedules, or control decks.

### Feature Permissions
These are boolean gates in the `user_permissions` table:
- **Announcements** (`can_announce`): Control microphones and trigger Text-to-Speech (TTS) broadcasts.
- **Scheduling** (`can_schedule`): Create and delete music programs and automated mixer schedules.
- **Library** (`can_library`): Upload and delete music files in the audio library.
- **Requests & Stats** (`can_requests`): Accept or dismiss user-submitted track requests and view playback statistics.
- **Settings** (`can_settings`): Access branding, server paths, and LDAP network configuration (Reserved for `super_admin`).

### Granular Media Actions
- **Allowed Decks**: Restrict which decks a user can see (e.g., `["a", "b", "c", "d", "e"]`).
- **Deck Control**: Define view vs control access per deck (e.g., Deck A view-only vs Deck B view+control).
- **Deck Actions**: `deck.play`, `deck.pause`, `deck.stop`, `deck.next`, `deck.previous`, `deck.volume`, `deck.crossfader`, `deck.load_track`, `deck.load_playlist`.
- **Playlist Actions**: `playlist.view`, `playlist.load`, `playlist.create`, `playlist.edit`, `playlist.delete`.

---

## 3. Proposed Changes

### 3.1 Backend API & Database

#### Database Migration (`019_clean_and_redesign_auth.sql`)
1. Wipes all users from the `users` and `user_permissions` tables, keeping **only** `cocoadmin` (the super-user).
2. Clears the `ldap_group_role_map` table, as group mapping is deprecated.

#### DB Client (`api/db_client.py`)
1. Remove `resolve_role_from_group_map`.
2. Modify `sync_ldap_user(username, display_name, email, ldap_dn, member_of)`:
   - If the LDAP user does not exist in the database, insert them with `role = 'viewer'` and `enabled = True`.
   - If they already exist, retrieve and return their current row **without** modifying their role or permissions.

#### Authentication (`api/auth.py` and `api/auth_routes.py`)
1. Clean up imports and remove the `ldap_role_*` settings mappings.
2. Remove role mapping endpoints:
   - `GET /api/settings/ldap/role-mappings`
   - `POST /api/settings/ldap/role-mappings`
3. Secure User Management endpoints in `api/main.py`:
   - In `update_user` (`PUT /api/users/{user_id}`), check if the user being updated has `is_super_admin = True` or `role = 'super_admin'`. If yes, raise `HTTPException(400, "Super-admin account cannot be modified.")`.
   - In `delete_user` (`DELETE /api/users/{user_id}`), check if the user being deleted has `is_super_admin = True` or `role = 'super_admin'`. If yes, raise `HTTPException(400, "Super-admin account cannot be deleted.")`.
   - In `save_user_permissions` (`PUT /api/users/{user_id}/permissions`), restrict editing permissions of super-admin users.

---

### 3.2 Frontend (Vite/React Dashboard)

#### Remove Roles Page
1. **Delete** `dashboard/src/pages/RolesPage.jsx`.
2. In `dashboard/src/App.jsx`, remove the import of `RolesPage` and its Route definition (`/roles`).
3. In `dashboard/src/components/Sidebar.jsx`, remove the "Roles" sidebar link.

#### Redesign Users Manager (`dashboard/src/pages/UsersPage.jsx`)
1. **Clean up Dead Code**: Remove the old Roles tab and group mapping UI blocks.
2. **Super-User Immutable Safeguards**:
   - For any user card/row where `is_super_admin` is True or `role === 'super_admin'`:
     - Hide or disable the "Delete" button.
     - Hide or disable the "Change Password" button.
     - Hide or disable the "Edit Permissions" button.
     - Render the "Active" toggle switch as a read-only text pill (cannot be disabled).
3. **LDAP User Labeling**:
   - Highlight LDAP users with a distinct badge or label (e.g. `[LDAP]` or `Domain Account`) to let the super-admin easily distinguish them from local accounts.
4. **Default Creation Role**:
   - Set the default role in the "Add User" form to `viewer`.

---

## 4. Verification Plan

### Manual Verification
1. Run database migrations and verify that all users except `cocoadmin` are removed.
2. Log in as `cocoadmin` and verify you can view the redesigned `/users` page. Verify `/roles` is gone.
3. Test LDAP Authentication:
   - Attempt to log in with a new LDAP user.
   - Verify they successfully authenticate, get created in the local database with the `'viewer'` role, and can view but not control the dashboard.
4. Admin Override Test:
   - As `cocoadmin`, go to `/users`, select the new LDAP user, and update their role to `'operator'` or add permission overrides.
   - Log out, log back in as that LDAP user, and verify they retain their `'operator'` access.
5. Protection Enforcement:
   - Verify that there are no buttons or options to edit, disable, or delete the `cocoadmin` user on the `/users` page.
   - Try using curl or Postman to send `DELETE /api/users/{cocoadmin_id}` and `PUT /api/users/{cocoadmin_id}`; verify the backend rejects it with `400 Bad Request`.
