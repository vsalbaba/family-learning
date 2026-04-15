interface Props {
  size?: number;
}

export default function TokenIcon({ size = 20 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        points="12,2 21.5,7 21.5,17 12,22 2.5,17 2.5,7"
        fill="#f59e0b"
        stroke="#d97706"
        strokeWidth="1.5"
      />
      <polygon
        points="12,4.5 19.5,8.5 19.5,15.5 12,19.5 4.5,15.5 4.5,8.5"
        fill="#fbbf24"
        stroke="none"
      />
      <circle cx="12" cy="12" r="4" fill="#f59e0b" stroke="#d97706" strokeWidth="1" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="6"
        fontWeight="bold"
        fill="#92400e"
      >
        T
      </text>
    </svg>
  );
}
