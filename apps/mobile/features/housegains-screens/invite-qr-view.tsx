import Svg, { Path, Rect } from 'react-native-svg';
import { Card } from '@/components/housegains/ui';
import { createInviteQr } from './invite-qr';

export function InviteQrView({ code, label }: { code: string; label: string }) {
  const { matrix } = createInviteQr(code);
  const quietZone = 4;
  const dimension = matrix.length + quietZone * 2;
  let path = '';
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (dark) path += `M${columnIndex + quietZone},${rowIndex + quietZone}h1v1h-1z`;
    });
  });

  return (
    <Card style={{ alignItems: 'center', padding: 12 }} testID="housegains.invite.qrCard">
      <Svg
        accessibilityLabel={label}
        accessible
        height={208}
        role="img"
        viewBox={`0 0 ${dimension} ${dimension}`}
        width={208}
      >
        <Rect fill="#ffffff" height={dimension} width={dimension} x={0} y={0} />
        <Path d={path} fill="#111111" />
      </Svg>
    </Card>
  );
}
