import { formatCents } from "@/lib/formatters";
import { calculateDiscount } from "@/lib/discounts";
import { Vehicle } from "@/server/data";
import { useBase64Image } from "@/util/useBase64Image";
import { DateTime } from "luxon";
import Link from "next/link";
import { Button } from "@/components/shared/ui/button";
import { Card, CardTitle } from "@/components/shared/ui/card";

export function VehicleListItem({
  vehicle,
  startDateTime,
  endDateTime,
}: {
  vehicle: Vehicle;
  startDateTime: Date;
  endDateTime: Date;
}) {
  const bookNowParams = new URLSearchParams({
    id: vehicle.id,
    start: startDateTime.toISOString(),
    end: endDateTime.toISOString(),
  });

  const imgData = useBase64Image(vehicle.thumbnail_url);

  const luxonStart = DateTime.fromJSDate(startDateTime);
  const luxonEnd = DateTime.fromJSDate(endDateTime);
  const durationInHours = luxonEnd.diff(luxonStart, "hours").hours;
  const discount = calculateDiscount(luxonStart, luxonEnd, vehicle.hourly_rate_cents, durationInHours);

  return (
    <Card
      key={vehicle.id}
      className="flex flex-col md:flex-row gap-6 md:gap-8 px-4 md:px-6 py-6"
    >
      <div className="max-w-[8rem] flex items-center mx-auto md:mx-0">
        <img src={imgData} alt={vehicle.make} className="w-full" />
      </div>
      <div className="w-full flex flex-col justify-center gap-2 lg:gap-4">
        <CardTitle className="text-lg font-semibold text-center md:text-left">
          {vehicle.make} {vehicle.model}
        </CardTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 w-full text-center md:text-left">
          <div className="flex flex-col">
            <dt className="text-sm text-gray-600">Year</dt>
            <dd className="text-sm font-medium">{vehicle.year}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm text-gray-600">Class</dt>
            <dd className="text-sm font-medium">{vehicle.classification}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm text-gray-600">Passengers</dt>
            <dd className="text-sm font-medium">{vehicle.max_passengers}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-sm text-gray-600">Doors</dt>
            <dd className="text-sm font-medium">{vehicle.doors}</dd>
          </div>
        </dl>
      </div>
      <div className="md:ml-auto text-center md:text-right flex flex-col justify-center mt-4 md:mt-0">
        <p className="text-xl font-bold">
          {discount.discountType === "duration" && (
            <span className="line-through text-gray-400 text-sm mr-1">
              {formatCents(vehicle.hourly_rate_cents)}
            </span>
          )}
          {formatCents(discount.effectiveHourlyRateCents)}
          <span className="text-sm text-gray-700 font-normal ml-0.5">/hr</span>
        </p>
        {discount.discountType !== null && (
          <div className="mt-1">
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
              {discount.discountType === "holiday" ? "17% Holiday Deal" : "Multi-Day Discount"}
            </span>
            <p className="text-sm text-gray-600 mt-1">
              Est. <span className="font-medium">{formatCents(discount.effectiveTotalPriceCents)}</span> total
              <span className="text-green-600 ml-1">
                (save {formatCents(discount.savingsCents)})
              </span>
            </p>
          </div>
        )}
        <Button asChild className="mt-2 w-full sm:w-auto">
          <Link href={`/review?${bookNowParams.toString()}`}>
            Book now
          </Link>
        </Button>
      </div>
    </Card>
  );
}
