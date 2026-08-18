<script lang="ts">
  import { Icon, type IconNode, type LucideProps } from "@lucide/svelte";

  let props: LucideProps = $props();

  const iconNode: IconNode = [
    [
      "path",
      {
        d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z",
      },
    ],
    [
      "path",
      {
        d: "M8.6 8.2c.4 3.7 3.1 6.4 6.8 6.8l1.2-1.2-2.3-1.1-.9.9a7 7 0 0 1-3-3l.9-.9-1.1-2.3z",
      },
    ],
  ];
</script>

<Icon name="whatsapp" {...props} {iconNode} />
