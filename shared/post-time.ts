import { DateTime } from 'luxon';

export function toKyivInput(value:string|null|undefined):string {
 if(!value)return '';
 const iso=DateTime.fromISO(value);
 const parsed=iso.isValid?iso:DateTime.fromSQL(value,{setZone:true});
 return parsed.isValid?parsed.setZone('Europe/Kyiv').toFormat("yyyy-MM-dd'T'HH:mm"):'';
}
export function fromKyivInput(value:string):string|null {
 const parsed=DateTime.fromISO(value,{zone:'Europe/Kyiv'});
 return parsed.isValid?parsed.toUTC().toISO():null;
}
