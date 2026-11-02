import { redline } from '~/redline.config';

/** The pin, tip on the spot, carrying the R. Same drawing as public/logo.svg. */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox='0 0 1024 1024'
      width={size}
      height={size}
      aria-hidden
      className={className}
    >
      <rect width='1024' height='1024' rx='184' fill={redline.colors.ink} />
      <path
        d='M196 828V512a316 316 0 1 1 316 316Z'
        fill={redline.colors.accent}
      />
      <path
        fillRule='evenodd'
        d='M396 330h146c84 0 136 46 136 118 0 52-27 90-73 107l85 141H582l-74-126h-20v126h-92Zm92 80v84h48c30 0 48-16 48-42s-18-42-48-42Z'
        fill='#FFFFFF'
      />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className='inline-flex items-center gap-2'>
      <LogoMark size={size} />
      <span className='text-[15px] font-semibold tracking-tight'>{redline.product.name}</span>
    </span>
  );
}
