import { useComics } from "../api/comicApi";

export default function useDiscountedComics(count) {
    
    const [loading, comics] = useComics();
    const filteredComics = comics
        .filter(comic => comic.oldPrice)
        .sort((a, b) => (Number(b.oldPrice) - Number(b.currentPrice)) - ((Number(a.oldPrice) - Number(a.currentPrice))))
        // .slice(0, count);

    return [loading, filteredComics];
}