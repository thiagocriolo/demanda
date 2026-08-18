<script lang="ts">
  import { ChevronsUpDown } from "@lucide/svelte";
  let { collapsed } = $props<{ collapsed: boolean }>();
</script>

<button class:collapsed class="profile" type="button" title="Perfil (em breve)">
  <span class="avatar" aria-hidden="true">TS</span>
  <span class="identity">
    <strong>Thiago</strong>
    <small>Administrador</small>
  </span>
  <ChevronsUpDown class="chevrons" size={16} />
</button>

<style>
  .profile {
    display: flex;
    width: calc(100% - 20px);
    min-height: 58px;
    align-items: center;
    gap: 10px;
    margin: auto 10px 12px;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 12px;
    color: white;
    background: rgba(255, 255, 255, 0.035);
    text-align: left;
  }
  .profile:hover {
    background: rgba(255, 255, 255, 0.07);
  }
  .avatar {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    place-items: center;
    border-radius: 10px;
    color: #dfe6ff;
    background: rgba(66, 99, 235, 0.24);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .identity {
    display: grid;
    min-width: 0;
    flex: 1;
  }
  .identity strong {
    overflow: hidden;
    font-size: var(--text-sm);
    text-overflow: ellipsis;
  }
  .identity small {
    color: #7f8da2;
    font-size: 0.68rem;
  }
  :global(.chevrons) {
    color: #69768a;
  }
  .collapsed {
    width: 46px;
    justify-content: center;
    padding: 4px;
  }
  .collapsed .identity,
  .collapsed :global(.chevrons) {
    display: none;
  }
</style>
