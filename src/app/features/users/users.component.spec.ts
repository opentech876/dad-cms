import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { UsersComponent } from './users.component';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { UserListEntry } from '../../models';

describe('UsersComponent', () => {
  let component: UsersComponent;
  let fixture: ComponentFixture<UsersComponent>;
  let mockWorkspace: {
    listUsers: jest.Mock;
    manageUser: jest.Mock;
    inviteUser: jest.Mock;
    getWorkspaceSummaries: jest.Mock;
  };

  const fakeUsers: UserListEntry[] = [
    {
      id: 'u1', email: 'alice@test.com', full_name: 'Alice Martin',
      phone: null, avatar_url: null, role: 'editeur',
      expires_at: null, banned: false, created_at: '2026-01-15T10:00:00Z',
      email_confirmed_at: '2026-01-16T09:00:00Z', invited_at: '2026-01-15T10:00:00Z',
    },
    {
      id: 'u2', email: 'bob@test.com', full_name: null,
      phone: null, avatar_url: null, role: 'owner',
      expires_at: null, banned: false, created_at: '2026-01-01T08:00:00Z',
      email_confirmed_at: '2026-01-01T08:00:00Z', invited_at: '2026-01-01T08:00:00Z',
    },
    {
      id: 'u3', email: 'carol@test.com', full_name: 'Carol Dupont',
      phone: null, avatar_url: null, role: 'charge_communication',
      expires_at: null, banned: false, created_at: '2026-01-20T09:00:00Z',
      email_confirmed_at: '2026-01-21T11:00:00Z', invited_at: '2026-01-20T09:00:00Z',
    },
    // A pending invitation — no email_confirmed_at.
    {
      id: 'u4', email: 'david@test.com', full_name: null,
      phone: null, avatar_url: null, role: 'editeur',
      expires_at: null, banned: false, created_at: '2026-06-20T14:00:00Z',
      email_confirmed_at: null, invited_at: '2026-06-20T14:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockWorkspace = {
      listUsers: jest.fn().mockReturnValue(of(fakeUsers)),
      manageUser: jest.fn().mockReturnValue(of({ success: true })),
      inviteUser: jest.fn().mockReturnValue(of({ success: true })),
      getWorkspaceSummaries: jest.fn().mockReturnValue(of([
        { id: 'ws-1', name: 'DIOUGA-DIOP Media', logo_url: null, member_count: 4, last_accessed_at: null },
      ])),
    };

    await TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        { provide: WorkspaceService, useValue: mockWorkspace },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
  });

  // ── loadUsers() ────────────────────────────────────────────────────────────

  describe('loadUsers()', () => {
    it('appelle workspaceService.listUsers() au démarrage', async () => {
      await component.ngOnInit();

      expect(mockWorkspace.listUsers).toHaveBeenCalled();
    });

    it('peuple le signal users avec le bon nombre d\'entrées', async () => {
      await component.ngOnInit();

      expect(component.users().length).toBe(4); // 3 actifs + 1 invitation en attente
    });

    it('mappe correctement l\'id de la première entrée', async () => {
      await component.ngOnInit();

      expect(component.users()[0].userId).toBe('u1');
    });

    it('mappe correctement full_name vers fullName', async () => {
      await component.ngOnInit();

      expect(component.users()[0].fullName).toBe('Alice Martin');
    });

    it('mappe correctement le champ banned', async () => {
      await component.ngOnInit();

      expect(component.users()[0].banned).toBe(false);
    });

    it('passe loading à false après le chargement', async () => {
      await component.ngOnInit();

      expect(component.loading()).toBe(false);
    });

    it('mappe correctement joinedAt depuis created_at', async () => {
      await component.ngOnInit();

      expect(component.users()[0].joinedAt).toBe('2026-01-15T10:00:00Z');
    });

    it('produit un tableau vide quand listUsers retourne []', async () => {
      mockWorkspace.listUsers.mockReturnValueOnce(of([]));

      await component.ngOnInit();

      expect(component.users()).toEqual([]);
    });
  });

  // ── filteredUsers() ────────────────────────────────────────────────────────

  describe('filteredUsers()', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('retourne tous les utilisateurs quand la recherche est vide', () => {
      component.searchQuery.set('');

      expect(component.filteredUsers().length).toBe(3);
    });

    it('filtre par fullName de manière insensible à la casse', () => {
      component.searchQuery.set('alice');

      expect(component.filteredUsers().length).toBe(1);
      expect(component.filteredUsers()[0].userId).toBe('u1');
    });

    it('filtre par email de manière insensible à la casse', () => {
      component.searchQuery.set('BOB@TEST');

      expect(component.filteredUsers().length).toBe(1);
      expect(component.filteredUsers()[0].userId).toBe('u2');
    });

    it('retourne un tableau vide quand aucun utilisateur ne correspond', () => {
      component.searchQuery.set('zzz-aucun-résultat');

      expect(component.filteredUsers()).toEqual([]);
    });
  });

  // ── actions menu ───────────────────────────────────────────────────────────

  describe('openActionsMenu() / closeActionsMenu()', () => {
    it('openActionsMenu() positionne activeMenuUserId sur l\'userId ciblé', () => {
      component.openActionsMenu('u1');

      expect(component.activeMenuUserId()).toBe('u1');
    });

    it('closeActionsMenu() remet activeMenuUserId à null', () => {
      component.openActionsMenu('u1');

      component.closeActionsMenu();

      expect(component.activeMenuUserId()).toBeNull();
    });

    it('ouvrir un second menu ferme le premier', () => {
      component.openActionsMenu('u1');

      component.openActionsMenu('u2');

      expect(component.activeMenuUserId()).toBe('u2');
    });
  });

  // ── handleAction() ─────────────────────────────────────────────────────────

  describe('handleAction()', () => {
    it('appelle workspaceService.manageUser() avec userId et action', async () => {
      await component.handleAction('u1', 'block');

      expect(mockWorkspace.manageUser).toHaveBeenCalledWith('u1', 'block', undefined);
    });

    it("passe le rôle dans le payload quand l'action est update_role", async () => {
      await component.handleAction('u1', 'update_role', 'chef_equipe');

      expect(mockWorkspace.manageUser).toHaveBeenCalledWith('u1', 'update_role', 'chef_equipe');
    });

    it('recharge la liste après une action réussie', async () => {
      await component.ngOnInit();
      mockWorkspace.listUsers.mockClear();

      await component.handleAction('u1', 'remove');

      expect(mockWorkspace.listUsers).toHaveBeenCalled();
    });

    it('ne recharge pas la liste si l\'action échoue', async () => {
      mockWorkspace.manageUser.mockReturnValueOnce(of({ success: false, error: 'Accès refusé' }));
      await component.ngOnInit();
      mockWorkspace.listUsers.mockClear();

      await component.handleAction('u1', 'remove');

      expect(mockWorkspace.listUsers).not.toHaveBeenCalled();
    });
  });

  // ── computed KPIs ──────────────────────────────────────────────────────────

  describe('computed KPIs', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('calcule kpiTotal comme le nombre total d\'utilisateurs', () => {
      expect(component.kpiTotal()).toBe(3);
    });

    it('calcule kpiOwners comme le nombre d\'owners', () => {
      expect(component.kpiOwners()).toBe(1);
    });

    it('calcule kpiEditors comme le nombre d\'éditeurs', () => {
      expect(component.kpiEditors()).toBe(1);
    });

    it('calcule kpiComm comme le nombre de chargés de communication', () => {
      expect(component.kpiComm()).toBe(1);
    });
  });

  // ── activeWorkspaceName ───────────────────────────────────────────────────

  describe("activeWorkspaceName", () => {
    it("est chargé depuis getWorkspaceSummaries au démarrage", async () => {
      await component.ngOnInit();
      expect(mockWorkspace.getWorkspaceSummaries).toHaveBeenCalled();
      expect(component.activeWorkspaceName()).toBe('DIOUGA-DIOP Media');
    });

    it("reste vide si getWorkspaceSummaries échoue (non-bloquant)", async () => {
      mockWorkspace.getWorkspaceSummaries.mockReturnValueOnce(of([]));
      await component.ngOnInit();
      expect(component.activeWorkspaceName()).toBe('');
    });
  });

  // ── Pending invitations ───────────────────────────────────────────────────

  describe('invitations en attente', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('pendingInvitations contient uniquement les utilisateurs sans email_confirmed_at', () => {
      const pending = component.pendingInvitations();
      expect(pending.length).toBe(1);
      expect(pending[0].userId).toBe('u4');
      expect(pending[0].email).toBe('david@test.com');
    });

    it('activeUsers exclut les invitations en attente', () => {
      const active = component.activeUsers();
      expect(active.length).toBe(3);
      expect(active.map(u => u.userId)).not.toContain('u4');
    });

    it("filteredPendingInvitations applique le filtre de recherche", () => {
      component.searchQuery.set('david');
      expect(component.filteredPendingInvitations().length).toBe(1);
      component.searchQuery.set('alice');
      expect(component.filteredPendingInvitations().length).toBe(0);
    });

    it("kpiTotal compte uniquement les membres actifs, pas les invitations", () => {
      expect(component.kpiTotal()).toBe(3); // 3 actifs (Alice + Bob + Carol); David est en attente
    });

    it("kpiEditors compte uniquement les éditeurs actifs", () => {
      expect(component.kpiEditors()).toBe(1); // Alice seulement (David en attente est aussi editeur)
    });

    describe('resendInvitation()', () => {
      it("appelle manageUser avec l'action resend_invitation", async () => {
        await component.resendInvitation('u4');
        expect(mockWorkspace.manageUser).toHaveBeenCalledWith('u4', 'resend_invitation');
      });

      it('recharge la liste après succès', async () => {
        mockWorkspace.listUsers.mockClear();
        await component.resendInvitation('u4');
        expect(mockWorkspace.listUsers).toHaveBeenCalled();
      });

      it("affiche l'erreur quand le RPC échoue", async () => {
        mockWorkspace.manageUser.mockReturnValueOnce(of({ success: false, error: 'rate_limit' }));
        await component.resendInvitation('u4');
        expect(component.invitationActionError()).toContain('rate_limit');
      });
    });

    describe('revokeInvitation()', () => {
      it("appelle manageUser avec l'action revoke_invitation", async () => {
        await component.revokeInvitation('u4');
        expect(mockWorkspace.manageUser).toHaveBeenCalledWith('u4', 'revoke_invitation');
      });

      it('recharge la liste après succès', async () => {
        mockWorkspace.listUsers.mockClear();
        await component.revokeInvitation('u4');
        expect(mockWorkspace.listUsers).toHaveBeenCalled();
      });
    });
  });

  // ── initials() ────────────────────────────────────────────────────────────

  describe('initials()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('retourne les initiales du fullName quand disponible', () => {
      const alice = component.users()[0]; // Alice Martin
      expect(component.initials(alice)).toBe('AM');
    });

    it('retourne les 2 premiers chars du userId quand fullName est null', () => {
      const bob = component.users()[1]; // full_name: null, userId: 'u2'
      expect(component.initials(bob)).toBe('U2');
    });
  });

  // ── isExpired() / isTempOwner() ────────────────────────────────────────────

  describe('isExpired() / isTempOwner()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it("isExpired retourne false quand expiresAt est null", () => {
      expect(component.isExpired(component.users()[0])).toBe(false);
    });

    it("isExpired retourne true quand la date est dépassée", () => {
      const user = { ...component.users()[0], expiresAt: '2000-01-01T00:00:00Z' };
      expect(component.isExpired(user)).toBe(true);
    });

    it("isExpired retourne false quand la date est dans le futur", () => {
      const user = { ...component.users()[0], expiresAt: '2099-01-01T00:00:00Z' };
      expect(component.isExpired(user)).toBe(false);
    });

    it("isTempOwner retourne true pour un owner avec expiresAt", () => {
      const user = { ...component.users()[1], expiresAt: '2099-01-01T00:00:00Z' }; // bob: owner
      expect(component.isTempOwner(user)).toBe(true);
    });

    it("isTempOwner retourne false pour un owner sans expiresAt", () => {
      expect(component.isTempOwner(component.users()[1])).toBe(false);
    });

    it("isTempOwner retourne false pour un non-owner avec expiresAt", () => {
      const user = { ...component.users()[0], expiresAt: '2099-01-01T00:00:00Z' }; // alice: editeur
      expect(component.isTempOwner(user)).toBe(false);
    });
  });

  // ── invite modal ───────────────────────────────────────────────────────────

  describe('openInviteModal() / closeInviteModal()', () => {
    it('openInviteModal ouvre la modal et réinitialise les champs', () => {
      component.inviteEmail.set('old@email.com');
      component.openInviteModal();
      expect(component.showInviteModal()).toBe(true);
      expect(component.inviteEmail()).toBe('');
      expect(component.inviteStatus()).toBe('idle');
    });

    it('closeInviteModal ferme la modal', () => {
      component.openInviteModal();
      component.closeInviteModal();
      expect(component.showInviteModal()).toBe(false);
    });
  });

  // ── role modal ─────────────────────────────────────────────────────────────

  describe('openRoleModal() / closeRoleModal()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('ouvre la modal et positionne roleModalUserId', () => {
      component.openRoleModal('u1');
      expect(component.showRoleModal()).toBe(true);
      expect(component.roleModalUserId()).toBe('u1');
    });

    it('pré-sélectionne le rôle courant de l\'utilisateur', () => {
      component.openRoleModal('u1'); // u1 est 'editeur'
      expect(component.roleModalTargetRole()).toBe('editeur');
    });

    it('closeRoleModal ferme la modal', () => {
      component.openRoleModal('u1');
      component.closeRoleModal();
      expect(component.showRoleModal()).toBe(false);
    });
  });

  describe('submitRoleChange()', () => {
    beforeEach(async () => {
      await component.ngOnInit();
      component.openRoleModal('u1');
      component.roleModalTargetRole.set('chef_equipe');
    });

    it('appelle manageUser avec update_role et le nouveau rôle', async () => {
      await component.submitRoleChange();
      expect(mockWorkspace.manageUser).toHaveBeenCalledWith('u1', 'update_role', 'chef_equipe');
    });

    it('ferme la modal après l\'action', async () => {
      await component.submitRoleChange();
      expect(component.showRoleModal()).toBe(false);
    });

    it('ne fait rien si roleModalUserId est null', async () => {
      component.roleModalUserId.set(null);
      await component.submitRoleChange();
      expect(mockWorkspace.manageUser).not.toHaveBeenCalled();
    });
  });

  // ── confirm modal ──────────────────────────────────────────────────────────

  describe('openConfirmModal() / closeConfirmModal()', () => {
    it('ouvre la modal avec userId et action', () => {
      component.openConfirmModal('u1', 'block');
      expect(component.showConfirmModal()).toBe(true);
      expect(component.confirmModalUserId()).toBe('u1');
      expect(component.confirmModalAction()).toBe('block');
    });

    it('closeConfirmModal ferme la modal', () => {
      component.openConfirmModal('u1', 'block');
      component.closeConfirmModal();
      expect(component.showConfirmModal()).toBe(false);
    });
  });

  describe('confirmAction()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('appelle manageUser avec l\'userId et l\'action confirmée', async () => {
      component.openConfirmModal('u1', 'block');
      await component.confirmAction();
      expect(mockWorkspace.manageUser).toHaveBeenCalledWith('u1', 'block', undefined);
    });

    it('ferme la modal après l\'action', async () => {
      component.openConfirmModal('u1', 'remove');
      await component.confirmAction();
      expect(component.showConfirmModal()).toBe(false);
    });

    it('ne fait rien si confirmModalUserId est null', async () => {
      component.openConfirmModal('u1', 'block');
      component.confirmModalUserId.set(null);
      await component.confirmAction();
      expect(mockWorkspace.manageUser).not.toHaveBeenCalled();
    });

    it('ne fait rien si confirmModalAction est null', async () => {
      component.confirmModalUserId.set('u1');
      component.confirmModalAction.set(null);
      await component.confirmAction();
      expect(mockWorkspace.manageUser).not.toHaveBeenCalled();
    });
  });

  // ── submitInvite() ─────────────────────────────────────────────────────────

  // ── set-password admin ─────────────────────────────────────────────────────

  describe('openPasswordModal / submitSetPassword', () => {
    beforeEach(async () => {
      await component.ngOnInit();
    });

    it('openPasswordModal initialise les signals et ouvre le modal', () => {
      component.openPasswordModal('u1');
      expect(component.showPasswordModal()).toBe(true);
      expect(component.passwordModalUserId()).toBe('u1');
      expect(component.passwordModalValue()).toBe('');
      expect(component.passwordModalShow()).toBe(false);
      expect(component.passwordModalError()).toBe('');
    });

    it('togglePasswordModalShow bascule la visibilité', () => {
      component.togglePasswordModalShow();
      expect(component.passwordModalShow()).toBe(true);
      component.togglePasswordModalShow();
      expect(component.passwordModalShow()).toBe(false);
    });

    it('passwordModalUser retourne le user actif du modal', () => {
      component.openPasswordModal('u1');
      expect(component.passwordModalUser()?.userId).toBe('u1');
    });

    it('submitSetPassword rejette un mot de passe < 8 caractères', async () => {
      component.openPasswordModal('u1');
      component.passwordModalValue.set('court');
      await component.submitSetPassword();
      expect(mockWorkspace.manageUser).not.toHaveBeenCalled();
      expect(component.passwordModalError()).toContain('8 caractères');
    });

    it("submitSetPassword appelle manageUser avec l'action set_password et le password", async () => {
      component.openPasswordModal('u1');
      component.passwordModalValue.set('motdepasseAdmin');
      await component.submitSetPassword();
      expect(mockWorkspace.manageUser).toHaveBeenCalledWith('u1', 'set_password', undefined, 'motdepasseAdmin');
    });

    it('submitSetPassword ferme le modal en cas de succès', async () => {
      component.openPasswordModal('u1');
      component.passwordModalValue.set('motdepasseAdmin');
      await component.submitSetPassword();
      expect(component.showPasswordModal()).toBe(false);
    });

    it("submitSetPassword affiche l'erreur en cas d'échec", async () => {
      mockWorkspace.manageUser.mockReturnValueOnce(of({ success: false, error: 'Boom' }));
      component.openPasswordModal('u1');
      component.passwordModalValue.set('motdepasseAdmin');
      await component.submitSetPassword();
      expect(component.passwordModalError()).toBe('Boom');
      expect(component.showPasswordModal()).toBe(true); // modal reste ouvert
    });
  });

  describe('submitInvite()', () => {
    beforeEach(() => {
      component.openInviteModal();
      component.inviteEmail.set('new@test.com');
      component.inviteRole.set('editeur');
    });

    it('appelle inviteUser avec email et rôle', async () => {
      await component.submitInvite();
      expect(mockWorkspace.inviteUser).toHaveBeenCalledWith('new@test.com', 'editeur');
    });

    it("passe inviteStatus à 'sent' en cas de succès", async () => {
      await component.submitInvite();
      expect(component.inviteStatus()).toBe('sent');
    });

    it("passe inviteStatus à 'error' en cas d'échec", async () => {
      mockWorkspace.inviteUser.mockReturnValueOnce(of({ success: false, error: 'Email invalide' }));
      await component.submitInvite();
      expect(component.inviteStatus()).toBe('error');
      expect(component.inviteError()).toBe('Email invalide');
    });

    it("passe inviteError au message par défaut si error est undefined", async () => {
      mockWorkspace.inviteUser.mockReturnValueOnce(of({ success: false }));
      await component.submitInvite();
      expect(component.inviteError()).toContain("Impossible");
    });

    it('ne fait rien si email est vide', async () => {
      component.inviteEmail.set('');
      await component.submitInvite();
      expect(mockWorkspace.inviteUser).not.toHaveBeenCalled();
    });

    it("ne fait rien si inviteStatus est déjà 'loading'", async () => {
      component.inviteStatus.set('loading');
      await component.submitInvite();
      expect(mockWorkspace.inviteUser).not.toHaveBeenCalled();
    });
  });

  describe('helpers branches restantes', () => {
    it('initials retombe sur l\'userId quand le nom est absent', () => {
      expect(component.initials({ fullName: null, userId: 'ab12cd' } as any)).toBe('AB');
    });

    it('isTempOwner est vrai pour un owner avec expiration', () => {
      expect(component.isTempOwner({ role: 'owner', expiresAt: '2030-01-01' } as any)).toBe(true);
      expect(component.isTempOwner({ role: 'editeur', expiresAt: '2030-01-01' } as any)).toBe(false);
    });

    it('onDocumentClick ferme le menu d\'actions', () => {
      component.openActionsMenu('u1');
      component.onDocumentClick();
      expect(component.activeMenuUserId()).toBeNull();
    });
  });
});
