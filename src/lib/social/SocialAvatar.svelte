<script lang="ts">
  let { src = null, name, size = 44 } = $props<{
    src?: string | null;
    name: string;
    size?: number;
  }>();
  let initials = $derived(
    name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "U",
  );
  let background = $derived.by(() => {
    if (!src) return "#dbe4ff";
    try {
      const color = new URL(src, "http://demanda.local").searchParams.get("bg");
      return color ? `#${color}` : "#dbe4ff";
    } catch {
      return "#dbe4ff";
    }
  });
</script>

<span
  class="social-avatar"
  style={`--avatar-size:${size}px;--avatar-bg:${background}`}
  aria-label={`Avatar de ${name}`}
>
  {#if src}
    <img {src} alt="" />
  {:else}
    <span>{initials}</span>
  {/if}
</span>

<style>
  .social-avatar {
    display: grid;
    width: var(--avatar-size);
    height: var(--avatar-size);
    flex: 0 0 var(--avatar-size);
    place-items: center;
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.09);
    border-radius: 50%;
    color: var(--brand-700);
    background: var(--avatar-bg);
    font-size: calc(var(--avatar-size) * 0.32);
    font-weight: 600;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
