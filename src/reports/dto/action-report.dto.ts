import { IsIn } from 'class-validator';

export class ActionReportDto {
  // 'strike' = confirmed violation: removes the content and issues a
  // strike against its author. 'dismiss' = no violation found.
  @IsIn(['strike', 'dismiss'])
  decision: 'strike' | 'dismiss';
}
