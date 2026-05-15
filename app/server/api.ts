import { DateTime } from "luxon";
import { calculateDiscount, type DiscountInfo } from "@/lib/discounts";
import {
  getAvailableVehicles,
  getReservationById,
  getVehicleById,
  getVehicles,
} from "./data_helpers";

const PRICE_STEP = 10;

const parseAndValidateTimeRange = (startTime: string, endTime: string) => {
  const start = DateTime.fromISO(startTime);
  const end = DateTime.fromISO(endTime);

  if (
    start.toString() === "Invalid Date" ||
    end.toString() === "Invalid Date"
  ) {
    throw new Error(
      "BAD REQUEST: Invalid date format. Please use ISO 8601 format.",
    );
  }

  if (end <= start) {
    throw new Error("BAD REQUEST: end_time must be after start_time");
  }
  return { start, end };
};

interface PriceQuote {
  totalPriceCents: number;
  hourlyRateCents: number;
  durationInHours: number;
  discount: DiscountInfo;
}

const calculateTotalPrice = (
  start: DateTime,
  end: DateTime,
  hourlyRateCents: number,
): PriceQuote => {
  const durationInHours = end.diff(start, "hours").hours || 0;
  const discount = calculateDiscount(start, end, hourlyRateCents, durationInHours);
  return {
    totalPriceCents: hourlyRateCents * durationInHours,
    hourlyRateCents,
    durationInHours,
    discount,
  };
};

const validateReservationAndGetVehicle = (input: {
  vehicleId: string;
  startTime: string;
  endTime: string;
}) => {
  const { vehicleId, startTime, endTime } = input;
  const { start, end } = parseAndValidateTimeRange(startTime, endTime);

  const vehicle = getVehicleById(vehicleId);

  if (!vehicle) {
    throw new Error("NOT_FOUND: Vehicle not found");
  }

  return { vehicle, start, end };
};

function searchVehicles(input: {
  startTime: string;
  endTime: string;
  passengerCount: number;
  classifications: string[];
  makes: string[];
  priceMin: number;
  priceMax: number;
}) {
  const {
    startTime,
    endTime,
    passengerCount,
    classifications,
    makes,
    priceMin,
    priceMax,
  } = input;

  const parsedPriceMin = priceMin;
  const allVehicles = getVehicles();
  const maxCents = Math.max(...allVehicles.map((v) => v.hourly_rate_cents));
  const sliderMax = Math.ceil(maxCents / 100 / PRICE_STEP) * PRICE_STEP + PRICE_STEP;
  const parsedPriceMax = priceMax >= sliderMax ? Number.MAX_SAFE_INTEGER : priceMax;

  try {
    const { start, end } = parseAndValidateTimeRange(startTime, endTime);

    const availableVehicles = getAvailableVehicles({
      startTime: start,
      endTime: end,
      passengerCount,
      classifications,
      makes,
      priceMinDollars: parsedPriceMin,
      priceMaxDollars: parsedPriceMax,
    });

    return {
      vehicles: availableVehicles,
    };
  } catch (error) {
    console.error(error);
    return {
      vehicles: [],
    }
  }
}

export interface FilterOptions {
  makes: string[];
  classifications: string[];
  passengerCounts: number[];
  priceRange: { min: number; max: number };
}

function getFilterOptions(): FilterOptions {
  const allVehicles = getVehicles();

  const uniqueMakes = [...new Set(allVehicles.map((v) => v.make))].sort();
  const uniqueClassifications = [
    ...new Set(allVehicles.map((v) => v.classification)),
  ].sort();
  const uniquePassengerCounts = [
    ...new Set(allVehicles.map((v) => v.max_passengers)),
  ].sort((a, b) => a - b);

  const maxCents = Math.max(...allVehicles.map((v) => v.hourly_rate_cents));
  const minCents = Math.min(...allVehicles.map((v) => v.hourly_rate_cents));
  const priceMax = Math.ceil(maxCents / 100 / PRICE_STEP) * PRICE_STEP + PRICE_STEP;
  const priceMin = Math.floor(minCents / 100 / PRICE_STEP) * PRICE_STEP;

  return {
    makes: uniqueMakes,
    classifications: uniqueClassifications,
    passengerCounts: uniquePassengerCounts,
    priceRange: { min: priceMin, max: priceMax },
  };
}

function getVehicle(id: string) {
  const vehicle = getVehicleById(id);

  if (!vehicle) {
    throw new Error("NOT_FOUND: Vehicle not found");
  }

  return vehicle;
}

function getReservation(id: string) {
  const reservation = getReservationById(id);
  if (!reservation) {
    throw new Error("NOT_FOUND: Reservation not found");
  }
  return reservation;
}

function getQuote(input: {
  vehicleId: string;
  startTime: string;
  endTime: string;
}) {
  const { vehicle, start, end } = validateReservationAndGetVehicle(input);
  return calculateTotalPrice(start, end, vehicle.hourly_rate_cents);
}

export const API = {
  searchVehicles,
  getFilterOptions,
  getVehicle,
  getReservation,
  getQuote,
};
