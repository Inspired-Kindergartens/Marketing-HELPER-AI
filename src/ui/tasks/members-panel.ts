import type { MemberDirectoryData, MemberView } from "../../storage/member-store.js";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMemberRow(member: MemberView): string {
  return `
    <tr class="member-row${member.active ? "" : " member-row--inactive"}" data-member-id="${member.id}">
      <td class="member-row__name">${escapeHtml(member.name)}</td>
      <td>${member.email ? escapeHtml(member.email) : "—"}</td>
      <td>${member.role ? escapeHtml(member.role) : "—"}</td>
      <td class="member-row__usage">${member.projectCount} project${member.projectCount === 1 ? "" : "s"} · ${member.assignedTaskCount} task${member.assignedTaskCount === 1 ? "" : "s"}</td>
      <td class="member-row__actions">
        <button type="button" class="member-row__toggle" data-member-action="toggle-active" data-member-id="${member.id}" data-active="${member.active ? "1" : "0"}">
          ${member.active ? "Deactivate" : "Reactivate"}
        </button>
        <button type="button" class="member-row__delete" data-member-action="delete" data-member-id="${member.id}" aria-label="Delete member"><i class="bi bi-trash ui-icon" aria-hidden="true"></i></button>
      </td>
    </tr>
  `;
}

export type MembersPanelOptions = {
  directory: MemberDirectoryData;
};

export function renderMembersPanel(options: MembersPanelOptions): string {
  const { directory } = options;

  return `
    <div class="members-panel" data-members-panel>
      <form class="member-create" data-member-create>
        <input type="text" name="name" placeholder="Name" maxlength="120" required />
        <input type="email" name="email" placeholder="Email (optional)" maxlength="200" />
        <input type="text" name="role" placeholder="Role (optional)" maxlength="100" />
        <button type="submit"><i class="bi bi-plus-lg ui-icon" aria-hidden="true"></i><span>Add member</span></button>
      </form>
      <p class="members-panel__summary">${directory.activeCount} active · ${directory.members.length} total</p>
      <table class="member-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Usage</th><th></th></tr>
        </thead>
        <tbody>
          ${directory.members.length
            ? directory.members.map((member) => renderMemberRow(member)).join("")
            : `<tr><td colspan="5" class="member-table__empty">No members yet. Add people who can be assigned to tasks and projects.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}
